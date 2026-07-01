import { RequestType } from '@prisma/client';
import {
  getConditionFieldSchema,
  parseTimeToMinutes,
  sanitizeConditions,
} from './approval-conditions';
import { RulesService } from './rules.service';

describe('RulesService conditions', () => {
  const service = new RulesService(null as never);

  const evaluateAuto = (
    requestType: RequestType,
    conditions: Record<string, unknown>,
    extra: Record<string, unknown> = {},
  ) =>
    service.checkAutoConditions(
      { requestType, ...extra },
      sanitizeConditions(requestType, conditions) ?? null,
    );

  it('rejects cancellation auto-approval', () => {
    expect(evaluateAuto(RequestType.CANCELLATION, {}).allowed).toBe(false);
  });

  it('allows extra guest within capacity', () => {
    const result = evaluateAuto(RequestType.ADD_GUEST, {}, {
      currentGuests: 2,
      requestedGuests: 3,
      listingCapacity: 4,
    });
    expect(result.allowed).toBe(true);
  });

  it('rejects extra guest over capacity', () => {
    const result = evaluateAuto(RequestType.ADD_GUEST, {}, {
      currentGuests: 2,
      requestedGuests: 5,
      listingCapacity: 4,
    });
    expect(result.allowed).toBe(false);
  });

  it('rejects pet when requireManualForPets is set', () => {
    const result = evaluateAuto(
      RequestType.ADD_PET,
      { requireManualForPets: true },
      { listingAllowsPets: true, petsRequested: true },
    );
    expect(result.allowed).toBe(false);
  });

  it('auto-approves early check-in in allowed window', () => {
    const result = evaluateAuto(
      RequestType.EARLY_CHECKIN,
      {
        standardCheckInTime: '16:00',
        earliestAllowedCheckIn: '14:00',
      },
      { requestDetails: { requestedTime: '15:00' } },
    );
    expect(result.allowed).toBe(true);
  });

  it('rejects early check-in before earliest allowed', () => {
    const result = evaluateAuto(
      RequestType.EARLY_CHECKIN,
      {
        standardCheckInTime: '16:00',
        earliestAllowedCheckIn: '14:00',
      },
      { requestDetails: { requestedTime: '12:00' } },
    );
    expect(result.allowed).toBe(false);
  });

  it('auto-approves late check-out in allowed window', () => {
    const result = evaluateAuto(
      RequestType.LATE_CHECKOUT,
      {
        standardCheckOutTime: '11:00',
        latestAllowedCheckOut: '13:00',
      },
      { requestDetails: { requestedTime: '12:00' } },
    );
    expect(result.allowed).toBe(true);
  });
});

describe('approval-conditions utils', () => {
  it('parses HH:mm times', () => {
    expect(parseTimeToMinutes('16:00')).toBe(16 * 60);
    expect(parseTimeToMinutes('bad')).toBeNull();
  });

  it('exposes schema for admin UI', () => {
    expect(getConditionFieldSchema().EARLY_CHECKIN.fields).toHaveLength(2);
  });
});
