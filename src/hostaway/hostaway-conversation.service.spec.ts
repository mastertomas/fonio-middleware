import { HostawayConversationService } from './hostaway-conversation.service';

describe('HostawayConversationService', () => {
  const prisma = {
    reservation: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
  };
  const hostaway = {
    findConversationByReservation: jest.fn(),
  };
  const config = { get: jest.fn() };

  const service = new HostawayConversationService(
    prisma as never,
    hostaway as never,
    config as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('returns cached conversation id without API call', async () => {
    prisma.reservation.findUnique.mockResolvedValue({
      id: 'res-1',
      hostawayConversationId: 99,
    });
    const id = await service.resolveConversationId(12345);
    expect(id).toBe(99);
    expect(hostaway.findConversationByReservation).not.toHaveBeenCalled();
  });

  it('looks up and stores conversation id when missing', async () => {
    prisma.reservation.findUnique.mockResolvedValue({
      id: 'res-1',
      hostawayConversationId: null,
    });
    hostaway.findConversationByReservation.mockResolvedValue(42);
    prisma.reservation.update.mockResolvedValue({});

    const id = await service.resolveConversationId(12345);
    expect(id).toBe(42);
    expect(prisma.reservation.update).toHaveBeenCalledWith({
      where: { id: 'res-1' },
      data: expect.objectContaining({ hostawayConversationId: 42 }),
    });
  });
});
