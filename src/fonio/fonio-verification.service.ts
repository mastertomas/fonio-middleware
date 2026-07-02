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
import { normalizeDateInput } from '../common/utils/date-input.util';
import { HostawayClient } from '../hostaway/hostaway.client';
import { HostawaySyncService } from '../hostaway/hostaway-sync.service';
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

const FIELD_LABELS_DE: Record<VerificationField, string> = {
  stayDates: 'Anreise- und Abreisedatum',
  listingName: 'Name der Unterkunft',
  phone: 'Telefonnummer',
  email: 'E-Mail-Adresse',
  reservationId: 'Reservierungsnummer',
};

function joinLabelsDe(labels: string[]): string {
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} oder ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')} oder ${labels[labels.length - 1]}`;
}

function minMatchLabelDe(count: number): string {
  if (count === 1) return 'mindestens eine Angabe';
  return `mindestens ${count} Angaben`;
}

@Injectable()
export class FonioVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly hostaway: HostawayClient,
    private readonly sync: HostawaySyncService,
  ) {}

  async getRequirements() {
    const config = await this.prisma.verificationConfig.findFirst({
      where: { isDefault: true },
    });
    const scoringFields = this.getScoringFields(config?.requiredFields);
    const minMatch = Math.min(
      config?.minMatchCount ?? 3,
      scoringFields.length,
    );
    const optionalFields = scoringFields.filter((f) => f !== 'stayDates');
    const optionalFieldLabelsDe = optionalFields.map((f) => FIELD_LABELS_DE[f]);
    const optionalFieldsListDe = joinLabelsDe(optionalFieldLabelsDe);
    const hintDe = this.buildHintDe(minMatch, optionalFields);
    const guestScriptDe = this.buildGuestScriptDe(minMatch, optionalFieldLabelsDe);
    const verificationInstructionsDe = this.buildVerificationInstructionsDe({
      minMatch,
      optionalFieldsListDe,
      hintDe,
      guestScriptDe,
      bookingOfferEnabled: config?.bookingOfferEnabled ?? true,
    });

    return {
      alwaysRequired: ['stayDates'],
      optionalFields,
      optionalFieldLabelsDe,
      optionalFieldsListDe,
      minMatchCount: minMatch,
      bookingOfferEnabled: config?.bookingOfferEnabled ?? true,
      hintDe,
      guestScriptDe,
      verificationInstructionsDe,
      hintEn:
        'Arrival and departure dates are always required. Additionally provide at least ' +
        `${minMatch} matching details from: ${optionalFieldsListDe || 'configured fields'}. ` +
        'The guest does not need to provide all of these — only enough to confirm the booking.',
    };
  }

  async verify(dto: GuestVerifyDto) {
    this.assertStayDatesProvided(dto);
    const hint = (await this.getRequirements()).hintDe;

    const reservation = await this.findReservation(dto);
    if (!reservation) {
      throw new UnauthorizedException({
        verified: false,
        message: 'Reservation not found',
        hint,
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
      const missing = scoringFields.filter((f) => !checks.includes(f));
      throw new UnauthorizedException({
        verified: false,
        message: 'Guest verification failed',
        matchedFields: checks,
        missingFields: missing,
        requiredMinMatches: minMatch,
        reservationId: resolved.hostawayId,
        hint,
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
      hint,
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

    let reservation = await this.prisma.reservation.findUnique({
      where: { hostawayId: reservationHostawayId },
      include: { listing: true },
    });

    if (!reservation) {
      reservation = await this.sync.syncSingleReservation(reservationHostawayId);
    }

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

  private buildHintDe(
    minMatch: number,
    optionalFields: VerificationField[],
  ): string {
    const labels = optionalFields.map((f) => FIELD_LABELS_DE[f]);
    if (labels.length === 0) {
      return 'Anreise- und Abreisedatum sind immer erforderlich.';
    }
    return (
      'Anreise- und Abreisedatum sind immer erforderlich. Zusätzlich ' +
      `${minMatchLabelDe(minMatch)} aus: ${joinLabelsDe(labels)}. ` +
      'Der Gast muss nicht alles nennen — nur genug zur Bestätigung der Buchung.'
    );
  }

  private buildGuestScriptDe(
    minMatch: number,
    optionalLabels: string[],
  ): string {
    if (optionalLabels.length === 0) {
      return 'Zur Bestätigung brauche ich bitte Ihr An- und Abreisedatum.';
    }
    return (
      'Zur Bestätigung brauche ich zuerst Ihr An- und Abreisedatum. Danach reichen ' +
      `${minMatchLabelDe(minMatch)} — zum Beispiel ${joinLabelsDe(optionalLabels)}. ` +
      'Sie müssen nicht alles nennen.'
    );
  }

  private buildVerificationInstructionsDe(params: {
    minMatch: number;
    optionalFieldsListDe: string;
    hintDe: string;
    guestScriptDe: string;
    bookingOfferEnabled: boolean;
  }): string {
    const bookingOfferLine = params.bookingOfferEnabled
      ? '- Automatisches Buchungsangebot ist aktiv (booking-offer API).'
      : '- Automatisches Buchungsangebot ist deaktiviert — nur Verfügbarkeit prüfen, kein booking-offer.';

    return [
      '# Verifizierung bestehender Buchung (aus Admin-Einstellungen, live)',
      `Regel: ${params.hintDe}`,
      `Sage dem Gast in etwa: „${params.guestScriptDe}"`,
      `- Mindestanzahl übereinstimmender Angaben (ohne Daten): ${params.minMatch}`,
      params.optionalFieldsListDe
        ? `- Erlaubte Zusatzangaben (Either/Or): ${params.optionalFieldsListDe}`
        : '- Keine weiteren Zusatzfelder in Admin aktiviert — nur An- und Abreisedatum.',
      '- Frage NICHT der Reihe nach nach allen Feldern. Sammle, was der Gast nennt, dann Tool „Gast verifizieren“.',
      '- Bei Fehlschlag: „hint“ aus der API lesen und nur fehlende Angaben nachfragen.',
      '- Erkannter Anrufer oder Vorname allein reichen NICHT.',
      bookingOfferLine,
    ].join('\n');
  }

  private assertStayDatesProvided(dto: GuestVerifyDto) {
    if (!dto.arrivalDate?.trim() || !dto.departureDate?.trim()) {
      throw new UnauthorizedException({
        verified: false,
        message: 'Arrival and departure dates are required',
        missingFields: ['stayDates'],
        hint: 'Bitte Anreise- und Abreisedatum erfragen (z. B. 08.08.2026 und 10.08.2026).',
      });
    }
  }

  private async findReservation(dto: GuestVerifyDto) {
    if (dto.reservationId) {
      let reservation = await this.prisma.reservation.findUnique({
        where: { hostawayId: dto.reservationId },
        include: { listing: true },
      });
      if (!reservation) {
        reservation = await this.sync.syncSingleReservation(dto.reservationId);
      }
      return reservation;
    }

    const arrival = this.parseDateOnly(dto.arrivalDate);
    const departure = this.parseDateOnly(dto.departureDate);

    let candidates = await this.prisma.reservation.findMany({
      where: { arrivalDate: arrival, departureDate: departure },
      include: { listing: true },
    });

    if (candidates.length === 0) {
      await this.sync.syncReservationsForStayDates(arrival, departure);
      candidates = await this.prisma.reservation.findMany({
        where: { arrivalDate: arrival, departureDate: departure },
        include: { listing: true },
      });
    }

    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    const narrowed = await this.narrowCandidates(dto, candidates);
    if (narrowed.length === 1) return narrowed[0];
    if (narrowed.length === 0) return null;

    throw new UnauthorizedException({
      verified: false,
      message: 'Multiple bookings match — please provide more details',
      ambiguousCount: narrowed.length,
      hint: (await this.getRequirements()).hintDe,
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
    const normalized = normalizeDateInput(value) ?? value;
    const [y, m, d] = normalized.split('-').map(Number);
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
