import { Injectable } from '@nestjs/common';
import {
  ApprovalMode,
  Prisma,
  RequestType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface RuleEvaluationContext {
  listingId?: string;
  requestType: RequestType;
  currentGuests?: number;
  requestedGuests?: number;
  petsRequested?: boolean;
  listingCapacity?: number;
  listingAllowsPets?: boolean;
}

export interface RuleEvaluationResult {
  mode: ApprovalMode;
  ruleId?: string;
  reason: string;
}

@Injectable()
export class RulesService {
  constructor(private readonly prisma: PrismaService) {}

  async evaluate(context: RuleEvaluationContext): Promise<RuleEvaluationResult> {
    const rules = await this.prisma.approvalRule.findMany({
      where: {
        isActive: true,
        requestType: context.requestType,
        OR: [
          { listingId: context.listingId ?? undefined },
          { listingId: null },
        ],
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });

    const specific = rules.find((r) => r.listingId === context.listingId);
    const rule = specific ?? rules.find((r) => !r.listingId);

    if (!rule) {
      return this.defaultForRequestType(context);
    }

    if (rule.mode === ApprovalMode.DENY) {
      return {
        mode: ApprovalMode.DENY,
        ruleId: rule.id,
        reason: 'Request type denied by rule',
      };
    }

    if (rule.mode === ApprovalMode.MANUAL) {
      return {
        mode: ApprovalMode.MANUAL,
        ruleId: rule.id,
        reason: 'Manual approval required by rule',
      };
    }

    const autoCheck = this.checkAutoConditions(context, rule.conditions);
    if (!autoCheck.allowed) {
      return {
        mode: ApprovalMode.MANUAL,
        ruleId: rule.id,
        reason: autoCheck.reason,
      };
    }

    return {
      mode: ApprovalMode.AUTO,
      ruleId: rule.id,
      reason: 'Auto-approved by rule',
    };
  }

  private checkAutoConditions(
    context: RuleEvaluationContext,
    conditions: unknown,
  ): { allowed: boolean; reason: string } {
    const c = (conditions ?? {}) as Record<string, unknown>;

    if (context.requestType === RequestType.ADD_GUEST) {
      const cap = context.listingCapacity ?? 0;
      const requested = context.requestedGuests ?? context.currentGuests ?? 0;
      if (requested > cap) {
        return {
          allowed: false,
          reason: 'Requested guests exceed listing capacity',
        };
      }
    }

    if (context.requestType === RequestType.ADD_PET) {
      if (!context.listingAllowsPets) {
        return { allowed: false, reason: 'Pets not allowed for this listing' };
      }
      if (c.requireManualForPets === true) {
        return { allowed: false, reason: 'Pets require manual approval' };
      }
    }

    if (context.requestType === RequestType.CANCELLATION) {
      return { allowed: false, reason: 'Cancellations always require manual review' };
    }

    return { allowed: true, reason: 'Conditions met' };
  }

  private defaultForRequestType(
    context: RuleEvaluationContext,
  ): RuleEvaluationResult {
    if (context.requestType === RequestType.CANCELLATION) {
      return {
        mode: ApprovalMode.MANUAL,
        reason: 'Default: cancellations forwarded to team',
      };
    }
    if (
      context.requestType === RequestType.EARLY_CHECKIN ||
      context.requestType === RequestType.LATE_CHECKOUT
    ) {
      return {
        mode: ApprovalMode.MANUAL,
        reason: 'Default: check-in/out changes require manual review',
      };
    }
    return {
      mode: ApprovalMode.MANUAL,
      reason: 'Default: manual approval required',
    };
  }

  async seedDefaults() {
    const count = await this.prisma.approvalRule.count();
    if (count > 0) return;

    const defaults: {
      requestType: RequestType;
      mode: ApprovalMode;
      conditions?: Record<string, unknown>;
    }[] = [
      { requestType: RequestType.CANCELLATION, mode: ApprovalMode.MANUAL },
      { requestType: RequestType.MODIFICATION, mode: ApprovalMode.MANUAL },
      { requestType: RequestType.EARLY_CHECKIN, mode: ApprovalMode.MANUAL },
      { requestType: RequestType.LATE_CHECKOUT, mode: ApprovalMode.MANUAL },
      {
        requestType: RequestType.ADD_GUEST,
        mode: ApprovalMode.AUTO,
        conditions: { maxByCapacity: true },
      },
      {
        requestType: RequestType.ADD_PET,
        mode: ApprovalMode.AUTO,
        conditions: { requireManualForPets: false },
      },
    ];

    for (const rule of defaults) {
      await this.prisma.approvalRule.create({
        data: {
          requestType: rule.requestType,
          mode: rule.mode,
          conditions: rule.conditions as Prisma.InputJsonValue | undefined,
          priority: 0,
        },
      });
    }
  }
}
