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
  isVerificationField,
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
    const reservation = await this.prisma.reservation.findUnique({
      where: { hostawayId: dto.reservationId },
      include: { listing: true },
    });

    if (!reservation) {
      throw new UnauthorizedException({
        verified: false,
        message: 'Reservation not found',
      });
    }

    const config = await this.prisma.verificationConfig.findFirst({
      where: { isDefault: true },
    });

    const requiredFields = this.normalizeRequiredFields(
      config?.requiredFields ?? ['reservationId', 'phone', 'arrivalDate'],
    );
    const minMatch = Math.min(
      config?.minMatchCount ?? requiredFields.length,
      requiredFields.length,
    );

    const missing = this.missingRequiredInputs(dto, requiredFields);
    if (missing.length > 0) {
      throw new UnauthorizedException({
        verified: false,
        message: 'Missing required verification fields',
        missingFields: missing,
      });
    }

    const checks: string[] = [];
    let matches = 0;

    for (const field of requiredFields) {
      const matched = await this.fieldMatches(field, dto, reservation);
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
      });
    }

    const token = await this.jwt.signAsync({
      sub: reservation.id,
      reservationHostawayId: reservation.hostawayId,
      listingHostawayId: reservation.listing.hostawayId,
    } satisfies VerifiedSessionPayload);

    return {
      verified: true,
      verificationToken: token,
      matchedFields: checks,
      reservation: {
        id: reservation.hostawayId,
        arrivalDate: reservation.arrivalDate.toISOString().slice(0, 10),
        departureDate: reservation.departureDate.toISOString().slice(0, 10),
        guests: reservation.numberOfGuests,
        listingName: reservation.listing.name,
        listingCity: reservation.listing.city,
        status: reservation.status,
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

  private normalizeRequiredFields(fields: string[]): VerificationField[] {
    const normalized = fields.filter(isVerificationField);
    if (!normalized.includes('reservationId')) {
      normalized.unshift('reservationId');
    }
    return [...new Set(normalized)];
  }

  private missingRequiredInputs(
    dto: GuestVerifyDto,
    requiredFields: VerificationField[],
  ): VerificationField[] {
    const missing: VerificationField[] = [];
    for (const field of requiredFields) {
      if (field === 'reservationId') continue;
      if (!this.isProvided(dto, field)) missing.push(field);
    }
    return missing;
  }

  private isProvided(dto: GuestVerifyDto, field: VerificationField): boolean {
    switch (field) {
      case 'phone':
        return Boolean(dto.phone?.trim());
      case 'email':
        return Boolean(dto.email?.trim());
      case 'arrivalDate':
        return Boolean(dto.arrivalDate?.trim());
      case 'departureDate':
        return Boolean(dto.departureDate?.trim());
      case 'listingName':
        return Boolean(dto.listingName?.trim());
      default:
        return true;
    }
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
      case 'reservationId':
        return dto.reservationId === reservation.hostawayId;
      case 'phone':
        return dto.phone
          ? await this.verifyPhone(dto.phone, reservation)
          : false;
      case 'email':
        return dto.email ? this.verifyEmail(dto.email, reservation) : false;
      case 'arrivalDate':
        return (
          dto.arrivalDate === reservation.arrivalDate.toISOString().slice(0, 10)
        );
      case 'departureDate':
        return (
          dto.departureDate ===
          reservation.departureDate.toISOString().slice(0, 10)
        );
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
