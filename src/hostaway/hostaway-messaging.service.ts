import { Injectable, Logger } from '@nestjs/common';
import { RequestType } from '@prisma/client';
import { HostawayClient } from './hostaway.client';

const APPLIED_CHANGE_LABELS: Partial<Record<RequestType, string>> = {
  ADD_GUEST: '+1 Gast',
  ADD_PET: '+1 Haustier',
};

@Injectable()
export class HostawayMessagingService {
  private readonly logger = new Logger(HostawayMessagingService.name);

  constructor(private readonly hostaway: HostawayClient) {}

  formatTimestampDe(date = new Date()): { date: string; time: string } {
    const datePart = new Intl.DateTimeFormat('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
    const timePart = new Intl.DateTimeFormat('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
    return { date: datePart, time: `${timePart} Uhr` };
  }

  describeAppliedChange(
    requestType: RequestType,
    additionalGuests?: number,
  ): string {
    if (requestType === RequestType.ADD_GUEST) {
      const delta = Math.max(1, additionalGuests ?? 1);
      return delta === 1 ? '+1 Gast' : `+${delta} Gäste`;
    }
    return APPLIED_CHANGE_LABELS[requestType] ?? String(requestType);
  }

  async forwardRequestToInbox(params: {
    conversationId: number;
    guestRequestId: string;
    requestType: RequestType | string;
    requestTypeLabel?: string;
    summary: string;
    ruleReason?: string;
    callerNote?: string;
  }): Promise<number> {
    const typeLabel = params.requestTypeLabel ?? String(params.requestType);
    const body = [
      '[fonio.ai – Gästeanfrage]',
      `Anfrage-ID: ${params.guestRequestId}`,
      `Typ: ${typeLabel}`,
      params.ruleReason ? `Grund: ${params.ruleReason}` : '',
      '',
      params.summary,
      params.callerNote ? `\nAnrufer-Hinweis: ${params.callerNote}` : '',
      '',
      'Bitte im Hostaway-Dashboard bearbeiten.',
    ]
      .filter(Boolean)
      .join('\n');

    const messageId = await this.hostaway.sendConversationMessage(
      params.conversationId,
      body,
      'channel',
    );

    this.logger.log(
      `Forwarded request ${params.guestRequestId} to conversation ${params.conversationId} (message ${messageId})`,
    );
    return messageId;
  }

  async notifyAppliedChangeToInbox(params: {
    conversationId: number;
    requestType: RequestType;
    additionalGuests?: number;
    occurredAt?: Date;
  }): Promise<number> {
    const { date, time } = this.formatTimestampDe(params.occurredAt);
    const change = this.describeAppliedChange(
      params.requestType,
      params.additionalGuests,
    );
    const body = [
      '[fonio.ai – Telefonische Aktualisierung]',
      `Telefonische Buchungsänderung durch Gast – ${date}, ${time}: ${change}`,
      '',
      'Die Änderung wurde automatisch in der Reservierung übernommen.',
    ].join('\n');

    const messageId = await this.hostaway.sendConversationMessage(
      params.conversationId,
      body,
      'channel',
    );

    this.logger.log(
      `Posted applied-change note to conversation ${params.conversationId} (message ${messageId})`,
    );
    return messageId;
  }

  async notifyPaymentReceivedToInbox(params: {
    conversationId: number;
    amount: number;
    currency?: string;
    occurredAt?: Date;
    paymentMethodLabel?: string;
    source?: 'hostaway' | 'fonio';
  }): Promise<number> {
    const { date, time } = this.formatTimestampDe(params.occurredAt);
    const currency = params.currency ?? 'EUR';
    const amountLabel = new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency,
    }).format(params.amount);
    const header =
      params.source === 'fonio'
        ? '[fonio.ai – Zahlung]'
        : '[Hostaway – Zahlungseingang]';
    const body = [
      header,
      `Zahlung eingegangen am ${date} um ${time}.`,
      `Betrag: ${amountLabel}`,
      params.paymentMethodLabel
        ? `Zahlungsart: ${params.paymentMethodLabel}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    const messageId = await this.hostaway.sendConversationMessage(
      params.conversationId,
      body,
      'channel',
    );

    this.logger.log(
      `Posted payment-received note to conversation ${params.conversationId} (message ${messageId})`,
    );
    return messageId;
  }
}
