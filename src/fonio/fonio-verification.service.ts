import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  hashPhoneForStorage,
  hashValue,
  phonesMatch,
} from '../common/utils/crypto.util';
import { HostawayClient } from '../hostaway/hostaway.client';
import { PrismaService } from '../prisma/prisma.service';
import { GuestVerifyDto } from './dto/guest-verify.dto';
import {
  normalizeVerificationConfigFields,
  VERIFICATION_FIELD_OPTIONS,
  VerificationField,
} from './verification-fields';

export interface VerifiedSessionPayload {
  sub: string;
  reservationHostawayId: number;
  listingHostawayId: number;
}

@Injectable()
export class FonioVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly hostaway: HostawayClient,
  ) {}

  async verify(dto: GuestVerifyDto) {
    this.assertStayDatesProvided(dto);

    const reservation = await this.findReservation(dto);
    if (!reservation) {
      throw new UnauthorizedException({
        verified: false,
        message: 'Reservation not found',
      });
    }

    const resolved = reservation;

    const config = await this.prisma.verificationConfig.findFirst({
      where: { isDefault: true },
    });

    const scoringFields = this.getScoringFields(config?.requiredFields);
    const minMatch = Math.min(
      config?.minMatchCount ?? 3,
      scoringFields.length,
    );

    const checks: string[] = [];
    let matches = 0;

    for (const field of scoringFields) {
      const matched = await this.fieldMatches(field, dto, resolved);
      if (matched) {
        matches++;
        checks.push(field);
      }
    }

    if (matches < minMatch) {
      throw new UnauthorizedException({
        verified: false,
        message: 'Guest verification failed',
        matchedFields: checks,
        requiredMinMatches: minMatch,
        reservationId: resolved.hostawayId,
      });
    }

    const token = await this.jwt.signAsync({
      sub: resolved.id,
      reservationHostawayId: resolved.hostawayId,
      listingHostawayId: resolved.listing.hostawayId,
    } satisfies VerifiedSessionPayload);

    return {
      verified: true,
      verificationToken: token,
      matchedFields: checks,
      reservation: {
        id: resolved.hostawayId,
        arrivalDate: resolved.arrivalDate.toISOString().slice(0, 10),
        departureDate: resolved.departureDate.toISOString().slice(0, 10),
        guests: resolved.numberOfGuests,
        listingName: resolved.listing.name,
        listingCity: resolved.listing.city,
        status: resolved.status,
      },
    };
  }

  async assertVerified(token: string, reservationHostawayId: number) {
    if (!token) {
      throw new UnauthorizedException('Verification token required');
    }

    let payload: VerifiedSessionPayload;
    try {
      payload = await this.jwt.verifyAsync<VerifiedSessionPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired verification token');
    }

    if (payload.reservationHostawayId !== reservationHostawayId) {
      throw new UnauthorizedException('Token does not match reservation');
    }

    return payload;
  }

  async getSafeReservation(reservationHostawayId: number, token: string) {
    await this.assertVerified(token, reservationHostawayId);

    const reservation = await this.prisma.reservation.findUnique({
      where: { hostawayId: reservationHostawayId },
      include: { listing: true },
    });

    if (!reservation) {
      throw new NotFoundException('Reservation not found');
    }

    return {
      id: reservation.hostawayId,
      arrivalDate: reservation.arrivalDate.toISOString().slice(0, 10),
      departureDate: reservation.departureDate.toISOString().slice(0, 10),
      guests: reservation.numberOfGuests,
      listingName: reservation.listing.name,
      listingCity: reservation.listing.city,
      status: reservation.status,
    };
  }

  private getScoringFields(configFields?: string[]): VerificationField[] {
    const normalized = normalizeVerificationConfigFields(
      configFields ?? [
        'stayDates',
        'listingName',
        'phone',
        'email',
        'reservationId',
      ],
    );
    return normalized.length > 0
      ? normalized
      : [...VERIFICATION_FIELD_OPTIONS];
  }

  private assertStayDatesProvided(dto: GuestVerifyDto) {
    if (!dto.arrivalDate?.trim() || !dto.departureDate?.trim()) {
      throw new UnauthorizedException({
        verified: false,
        message: 'Arrival and departure dates are required',
        missingFields: ['stayDates'],
      });
    }
  }

  private async findReservation(dto: GuestVerifyDto) {
    if (dto.reservationId) {
      return this.prisma.reservation.findUnique({
        where: { hostawayId: dto.reservationId },
        include: { listing: true },
      });
    }

    const arrival = this.parseDateOnly(dto.arrivalDate);
    const departure = this.parseDateOnly(dto.departureDate);

    const candidates = await this.prisma.reservation.findMany({
      where: { arrivalDate: arrival, departureDate: departure },
      include: { listing: true },
    });

    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    const narrowed = await this.narrowCandidates(dto, candidates);
    if (narrowed.length === 1) return narrowed[0];
    if (narrowed.length === 0) return null;

    throw new UnauthorizedException({
      verified: false,
      message: 'Multiple bookings match — please provide more details',
      ambiguousCount: narrowed.length,
    });
  }

  private async narrowCandidates(
    dto: GuestVerifyDto,
    candidates: NonNullable<
      Awaited<
        ReturnType<
          typeof this.prisma.reservation.findMany<{
            include: { listing: true };
          }>
        >
      >
    >[number][],
  ) {
    let pool = [...candidates];

    if (dto.listingName?.trim()) {
      const term = dto.listingName.trim().toLowerCase();
      const byListing = pool.filter((r) =>
        r.listing.name.toLowerCase().includes(term),
      );
      if (byListing.length > 0) pool = byListing;
    }

    if (dto.phone?.trim()) {
      const byPhone: typeof pool = [];
      for (const r of pool) {
        if (await this.verifyPhone(dto.phone, r)) byPhone.push(r);
      }
      if (byPhone.length > 0) pool = byPhone;
    }

    if (dto.email?.trim()) {
      const byEmail: typeof pool = [];
      for (const r of pool) {
        if (await this.verifyEmail(dto.email, r)) byEmail.push(r);
      }
      if (byEmail.length > 0) pool = byEmail;
    }

    return pool;
  }

  private parseDateOnly(value: string): Date {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }

  private async fieldMatches(
    field: VerificationField,
    dto: GuestVerifyDto,
    reservation: {
      guestPhone: string | null;
      phoneHash: string | null;
      guestEmail: string | null;
      emailHash: string | null;
      arrivalDate: Date;
      departureDate: Date;
      listing: { name: string };
      hostawayId: number;
    },
  ): Promise<boolean> {
    switch (field) {
      case 'stayDates':
        return (
          dto.arrivalDate ===
            reservation.arrivalDate.toISOString().slice(0, 10) &&
          dto.departureDate ===
            reservation.departureDate.toISOString().slice(0, 10)
        );
      case 'reservationId':
        return (
          dto.reservationId !== undefined &&
          dto.reservationId === reservation.hostawayId
        );
      case 'phone':
        return dto.phone
          ? await this.verifyPhone(dto.phone, reservation)
          : false;
      case 'email':
        return dto.email
          ? await this.verifyEmail(dto.email, reservation)
          : false;
      case 'listingName': {
        if (!dto.listingName) return false;
        return reservation.listing.name
          .toLowerCase()
          .includes(dto.listingName.toLowerCase());
      }
      default:
        return false;
    }
  }

  private async verifyPhone(
    phone: string,
    reservation: {
      guestPhone: string | null;
      phoneHash: string | null;
      hostawayId: number;
    },
  ): Promise<boolean> {
    if (reservation.guestPhone && phonesMatch(phone, reservation.guestPhone)) {
      return true;
    }
    if (
      reservation.phoneHash &&
      hashPhoneForStorage(phone) === reservation.phoneHash
    ) {
      return true;
    }
    const remote = await this.hostaway.getReservation(reservation.hostawayId);
    return Boolean(remote.phone && phonesMatch(phone, remote.phone));
  }

  private async verifyEmail(
    email: string,
    reservation: {
      guestEmail: string | null;
      emailHash: string | null;
      hostawayId: number;
    },
  ): Promise<boolean> {
    if (
      reservation.guestEmail &&
      email.toLowerCase() === reservation.guestEmail.toLowerCase()
    ) {
      return true;
    }
    if (reservation.emailHash && hashValue(email) === reservation.emailHash) {
      return true;
    }
    const remote = await this.hostaway.getReservation(reservation.hostawayId);
    if (
      remote.guestEmail &&
      hashValue(email) === hashValue(remote.guestEmail)
    ) {
      return true;
    }
    return false;
  }

  static getFieldOptions() {
    return VERIFICATION_FIELD_OPTIONS;
  }
}
