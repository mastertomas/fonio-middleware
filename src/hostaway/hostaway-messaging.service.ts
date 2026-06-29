import { Injectable, Logger } from '@nestjs/common';
import { HostawayClient } from './hostaway.client';

@Injectable()
export class HostawayMessagingService {
  private readonly logger = new Logger(HostawayMessagingService.name);

  constructor(private readonly hostaway: HostawayClient) {}

  async forwardRequestToInbox(params: {
    conversationId: number;
    guestRequestId: string;
    requestType: string;
    summary: string;
    callerNote?: string;
  }): Promise<number> {
    const body = [
      '[fonio.ai – Gästeanfrage]',
      `Anfrage-ID: ${params.guestRequestId}`,
      `Typ: ${params.requestType}`,
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
      `Forwarded request ${params.guestRequestId} to conversation ${params.conversationId}`,
    );
    return messageId;
  }
}
