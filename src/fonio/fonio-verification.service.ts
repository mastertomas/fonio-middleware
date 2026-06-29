import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hashPhoneForStorage, hashValue, phonesMatch } from '../common/utils/crypto.util';
import { HostawayClient } from '../hostaway/hostaway.client';
import { PrismaService } from '../prisma/prisma.service';
import { GuestVerifyDto } from './dto/guest-verify.dto';

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
      throw new NotFoundException('Reservation not found');
    }

    const config = await this.prisma.verificationConfig.findFirst({
      where: { isDefault: true },
    });

    const requiredFields = config?.requiredFields ?? [
      'reservationId',
      'phone',
      'arrivalDate',
    ];
    const minMatch = config?.minMatchCount ?? 2;

    let matches = 0;
    const checks: string[] = [];

    if (requiredFields.includes('reservationId')) {
      matches++;
      checks.push('reservationId');
    }

    if (dto.phone) {
      let phoneVerified = false;
      if (reservation.phoneHash && hashPhoneForStorage(dto.phone) === reservation.phoneHash) {
        phoneVerified = true;
      } else {
        const remote = await this.hostaway.getReservation(dto.reservationId);
        if (remote.phone && phonesMatch(dto.phone, remote.phone)) {
          phoneVerified = true;
        }
      }
      if (phoneVerified) {
        matches++;
        checks.push('phone');
      }
    }

    if (dto.email) {
      let emailVerified = false;
      if (reservation.emailHash && hashValue(dto.email) === reservation.emailHash) {
        emailVerified = true;
      } else {
        const remote = await this.hostaway.getReservation(dto.reservationId);
        if (remote.guestEmail && hashValue(dto.email) === hashValue(remote.guestEmail)) {
          emailVerified = true;
        }
      }
      if (emailVerified) {
        matches++;
        checks.push('email');
      }
    }

    if (dto.arrivalDate) {
      const expected = reservation.arrivalDate.toISOString().slice(0, 10);
      if (dto.arrivalDate === expected) {
        matches++;
        checks.push('arrivalDate');
      }
    }

    if (dto.departureDate) {
      const expected = reservation.departureDate.toISOString().slice(0, 10);
      if (dto.departureDate === expected) {
        matches++;
        checks.push('departureDate');
      }
    }

    if (dto.listingName) {
      const listingName = reservation.listing.name.toLowerCase();
      if (listingName.includes(dto.listingName.toLowerCase())) {
        matches++;
        checks.push('listingName');
      }
    }

    if (matches < minMatch) {
      throw new UnauthorizedException({
        verified: false,
        message: 'Guest verification failed',
        matchedFields: checks,
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
}
