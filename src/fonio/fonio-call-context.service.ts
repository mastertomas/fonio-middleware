import { Injectable } from '@nestjs/common';
import {
  extractFirstName,
  phoneHashVariants,
} from '../common/utils/crypto.util';
import { PrismaService } from '../prisma/prisma.service';
import { FonioCallContextDto } from './dto/call-context.dto';

@Injectable()
export class FonioCallContextService {
  constructor(private readonly prisma: PrismaService) {}

  async buildContext(dto: FonioCallContextDto) {
    const base = {
      verified: false,
      caller_phone: dto.callerNumber ?? null,
      call_id: dto.callId ?? null,
      language: 'de',
      caller_recognized: false,
      has_upcoming_booking: false,
      guest_name_hint: null as string | null,
      listing_city_hint: null as string | null,
      greeting_hint:
        'Guten Tag, Sie erreichen brainions Vermietung. Wie kann ich Ihnen helfen?',
    };

    if (!dto.callerNumber) {
      return base;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const hashes = phoneHashVariants(dto.callerNumber);
    const reservation = await this.prisma.reservation.findFirst({
      where: {
        phoneHash: { in: hashes },
        departureDate: { gte: today },
        NOT: { status: { in: ['cancelled', 'declined', 'expired'] } },
      },
      include: { listing: true },
      orderBy: { arrivalDate: 'asc' },
    });

    if (!reservation) {
      return base;
    }

    const firstName = extractFirstName(reservation.guestNameMasked);
    const greeting = firstName
      ? `Guten Tag ${firstName}, Sie erreichen brainions Vermietung. Ich sehe, dass Sie eine anstehende Buchung haben. Wie kann ich Ihnen helfen?`
      : 'Guten Tag, Sie erreichen brainions Vermietung. Ich sehe, dass Sie eine anstehende Buchung haben. Wie kann ich Ihnen helfen?';

    return {
      ...base,
      caller_recognized: true,
      has_upcoming_booking: true,
      guest_name_hint: reservation.guestNameMasked,
      listing_city_hint: reservation.listing.city,
      greeting_hint: greeting,
      // fonio can use these in prompts – full details still require guest/verify
      hint_requires_verification: true,
    };
  }
}
