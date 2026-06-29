import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import {
  HostawayCalendarDay,
  HostawayListResponse,
  HostawayListing,
  HostawayReservation,
  HostawaySingleResponse,
  HostawayTokenResponse,
} from './hostaway.types';

@Injectable()
export class HostawayClient {
  private readonly logger = new Logger(HostawayClient.name);
  private readonly http: AxiosInstance;
  private readonly accountId: string;
  private readonly apiSecret: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.accountId = this.config.getOrThrow<string>('HOSTAWAY_ACCOUNT_ID');
    this.apiSecret = this.config.getOrThrow<string>('HOSTAWAY_API_SECRET');
    const baseURL =
      this.config.get<string>('HOSTAWAY_API_BASE_URL') ??
      'https://api.hostaway.com/v1';

    this.http = axios.create({
      baseURL,
      timeout: 30000,
      headers: { 'Cache-Control': 'no-cache' },
    });

    this.http.interceptors.request.use(async (req) => {
      const token = await this.getAccessToken();
      req.headers.Authorization = `Bearer ${token}`;
      return req;
    });
  }

  async getAccessToken(): Promise<string> {
    const cached = await this.prisma.hostawayToken.findFirst({
      orderBy: { createdAt: 'desc' },
    });

    if (cached && cached.expiresAt > new Date(Date.now() + 60_000)) {
      return cached.accessToken;
    }

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.accountId,
      client_secret: this.apiSecret,
      scope: 'general',
    });

    const { data } = await axios.post<HostawayTokenResponse>(
      `${this.config.get('HOSTAWAY_API_BASE_URL') ?? 'https://api.hostaway.com/v1'}/accessTokens`,
      body.toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      },
    );

    await new Promise((r) => setTimeout(r, 1100));

    const expiresAt = new Date(Date.now() + data.expires_in * 1000);
    await this.prisma.hostawayToken.create({
      data: {
        accessToken: data.access_token,
        expiresAt,
      },
    });

    this.logger.log('Hostaway access token refreshed');
    return data.access_token;
  }

  async getListings(limit = 100, offset = 0): Promise<HostawayListing[]> {
    const { data } = await this.http.get<HostawayListResponse<HostawayListing>>(
      '/listings',
      { params: { limit, offset } },
    );
    return data.result ?? [];
  }

  async getListing(id: number): Promise<HostawayListing> {
    const { data } = await this.http.get<HostawaySingleResponse<HostawayListing>>(
      `/listings/${id}`,
    );
    return data.result;
  }

  async getCalendar(
    listingId: number,
    startDate: string,
    endDate: string,
  ): Promise<HostawayCalendarDay[]> {
    const { data } = await this.http.get<
      HostawayListResponse<HostawayCalendarDay>
    >(`/listings/${listingId}/calendar`, {
      params: { startDate, endDate },
    });
    return data.result ?? [];
  }

  async getReservations(params: {
    limit?: number;
    offset?: number;
    arrivalStartDate?: string;
    arrivalEndDate?: string;
  }): Promise<HostawayReservation[]> {
    const { data } = await this.http.get<
      HostawayListResponse<HostawayReservation>
    >('/reservations', { params });
    return data.result ?? [];
  }

  async getReservation(id: number): Promise<HostawayReservation> {
    const { data } = await this.http.get<
      HostawaySingleResponse<HostawayReservation>
    >(`/reservations/${id}`);
    return data.result;
  }

  async findConversationByReservation(
    reservationId: number,
  ): Promise<number | null> {
    const { data } = await this.http.get<
      HostawayListResponse<{ id: number; reservationId: number }>
    >('/conversations', {
      params: { reservationId, limit: 1 },
    });
    return data.result?.[0]?.id ?? null;
  }

  async sendConversationMessage(
    conversationId: number,
    body: string,
    communicationType: 'channel' | 'email' = 'channel',
  ): Promise<number> {
    const { data } = await this.http.post<
      HostawaySingleResponse<{ id: number }>
    >(`/conversations/${conversationId}/messages`, {
      body,
      communicationType,
    });
    return data.result.id;
  }
}
