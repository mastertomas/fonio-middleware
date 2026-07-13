import { PaymentInboxService } from './payment-inbox.service';
import { HostawayGuestCharge } from './hostaway.types';

describe('PaymentInboxService', () => {
  const prisma = {
    reservation: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    notifiedGuestCharge: {
      createMany: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
    },
  };
  const hostaway = {
    getGuestCharges: jest.fn(),
  };
  const inbox = {
    notifyPaymentReceived: jest.fn(),
  };

  const service = new PaymentInboxService(
    prisma as never,
    hostaway as never,
    inbox as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('baselines existing paid charges without posting inbox notes', async () => {
    prisma.reservation.findUnique.mockResolvedValue({
      id: 'res-1',
      hostawayId: 123,
      paymentBaselinedAt: null,
      notifiedCharges: [],
    });
    hostaway.getGuestCharges.mockResolvedValue([
      { id: 10, status: 'paid', amount: 100, currency: 'EUR' },
      { id: 11, status: 'due', amount: 50, currency: 'EUR' },
    ] as HostawayGuestCharge[]);
    prisma.notifiedGuestCharge.createMany.mockResolvedValue({ count: 1 });
    prisma.reservation.update.mockResolvedValue({});

    const result = await service.processReservationPaymentUpdates(123);

    expect(result).toEqual({
      reservationHostawayId: 123,
      baselined: true,
      newPaidCharges: 0,
      inboxPosted: 0,
      inboxPending: 0,
    });
    expect(inbox.notifyPaymentReceived).not.toHaveBeenCalled();
    expect(prisma.notifiedGuestCharge.createMany).toHaveBeenCalledWith({
      data: [
        {
          hostawayChargeId: 10,
          reservationId: 'res-1',
          amount: 100,
          currency: 'EUR',
          inboxPosted: false,
        },
      ],
      skipDuplicates: true,
    });
  });

  it('posts inbox notes for newly paid charges after baseline', async () => {
    prisma.reservation.findUnique.mockResolvedValue({
      id: 'res-1',
      hostawayId: 123,
      paymentBaselinedAt: new Date('2026-01-01'),
      notifiedCharges: [{ hostawayChargeId: 10 }],
    });
    hostaway.getGuestCharges.mockResolvedValue([
      { id: 10, status: 'paid', amount: 100, currency: 'EUR' },
      {
        id: 12,
        status: 'paid',
        amount: 75,
        currency: 'EUR',
        paymentMethod: 'bank_transfer',
        chargeDate: '2026-07-13 14:20:00',
      },
    ] as HostawayGuestCharge[]);
    inbox.notifyPaymentReceived.mockResolvedValue({
      posted: true,
      messageId: 999,
      inboxPending: false,
    });
    prisma.notifiedGuestCharge.create.mockResolvedValue({});

    const result = await service.processReservationPaymentUpdates(123);

    expect(result).toEqual({
      reservationHostawayId: 123,
      baselined: false,
      newPaidCharges: 1,
      inboxPosted: 1,
      inboxPending: 0,
    });
    expect(inbox.notifyPaymentReceived).toHaveBeenCalledWith(
      expect.objectContaining({
        reservationHostawayId: 123,
        amount: 75,
        source: 'hostaway',
        paymentMethodLabel: 'Überweisung',
      }),
    );
  });
});
