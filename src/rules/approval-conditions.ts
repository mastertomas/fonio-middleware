import { RequestType } from '@prisma/client';

/** JSON conditions stored on ApprovalRule (admin-configurable). */
export interface ApprovalConditions {
  requireManualForPets?: boolean;
  maxAdditionalGuests?: number;
  standardCheckInTime?: string;
  earliestAllowedCheckIn?: string;
  standardCheckOutTime?: string;
  latestAllowedCheckOut?: string;
}

export const DEFAULT_STANDARD_CHECK_IN = '16:00';
export const DEFAULT_STANDARD_CHECK_OUT = '11:00';

export function parseTimeToMinutes(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function sanitizeConditions(
  requestType: RequestType,
  conditions: Record<string, unknown> | undefined,
): ApprovalConditions | undefined {
  if (!conditions) return undefined;
  const c = conditions as ApprovalConditions;
  const out: ApprovalConditions = {};

  if (requestType === RequestType.ADD_PET && c.requireManualForPets === true) {
    out.requireManualForPets = true;
  }

  if (requestType === RequestType.ADD_GUEST) {
    const max = Number(c.maxAdditionalGuests);
    if (Number.isFinite(max) && max > 0) {
      out.maxAdditionalGuests = Math.floor(max);
    }
  }

  if (requestType === RequestType.EARLY_CHECKIN) {
    const standard = parseTimeToMinutes(
      c.standardCheckInTime ?? DEFAULT_STANDARD_CHECK_IN,
    );
    const earliest = parseTimeToMinutes(
      c.earliestAllowedCheckIn ?? '14:00',
    );
    if (standard !== null) out.standardCheckInTime = formatMinutes(standard);
    if (earliest !== null) out.earliestAllowedCheckIn = formatMinutes(earliest);
  }

  if (requestType === RequestType.LATE_CHECKOUT) {
    const standard = parseTimeToMinutes(
      c.standardCheckOutTime ?? DEFAULT_STANDARD_CHECK_OUT,
    );
    const latest = parseTimeToMinutes(
      c.latestAllowedCheckOut ?? '13:00',
    );
    if (standard !== null) out.standardCheckOutTime = formatMinutes(standard);
    if (latest !== null) out.latestAllowedCheckOut = formatMinutes(latest);
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

export function getRequestedTime(
  details?: Record<string, unknown>,
): string | undefined {
  const raw =
    details?.requestedTime ??
    details?.checkInTime ??
    details?.checkOutTime ??
    details?.time;
  return typeof raw === 'string' ? raw : undefined;
}

export function getConditionFieldSchema() {
  return {
    ADD_PET: {
      fields: [
        {
          key: 'requireManualForPets',
          type: 'boolean',
          labelKey: 'rules.cond.requireManualForPets',
          hintKey: 'rules.cond.requireManualForPetsHint',
        },
      ],
    },
    ADD_GUEST: {
      fields: [
        {
          key: 'maxAdditionalGuests',
          type: 'number',
          labelKey: 'rules.cond.maxAdditionalGuests',
          hintKey: 'rules.cond.maxAdditionalGuestsHint',
        },
      ],
      noteKey: 'rules.cond.capacityNote',
    },
    EARLY_CHECKIN: {
      fields: [
        {
          key: 'standardCheckInTime',
          type: 'time',
          default: DEFAULT_STANDARD_CHECK_IN,
          labelKey: 'rules.cond.standardCheckIn',
          hintKey: 'rules.cond.standardCheckInHint',
        },
        {
          key: 'earliestAllowedCheckIn',
          type: 'time',
          default: '14:00',
          labelKey: 'rules.cond.earliestCheckIn',
          hintKey: 'rules.cond.earliestCheckInHint',
        },
      ],
      noteKey: 'rules.cond.earlyCheckInNote',
    },
    LATE_CHECKOUT: {
      fields: [
        {
          key: 'standardCheckOutTime',
          type: 'time',
          default: DEFAULT_STANDARD_CHECK_OUT,
          labelKey: 'rules.cond.standardCheckOut',
          hintKey: 'rules.cond.standardCheckOutHint',
        },
        {
          key: 'latestAllowedCheckOut',
          type: 'time',
          default: '13:00',
          labelKey: 'rules.cond.latestCheckOut',
          hintKey: 'rules.cond.latestCheckOutHint',
        },
      ],
      noteKey: 'rules.cond.lateCheckOutNote',
    },
    CANCELLATION: { noteKey: 'rules.cond.cancellationNote', fields: [] },
    MODIFICATION: { noteKey: 'rules.cond.manualOnlyNote', fields: [] },
    RESERVATION_QUESTION: { noteKey: 'rules.cond.manualOnlyNote', fields: [] },
    OTHER: { noteKey: 'rules.cond.manualOnlyNote', fields: [] },
  };
}
