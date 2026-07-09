import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { normalizeDateInput } from '../../common/utils/date-input.util';
import { normalizeOptionalInput } from '../../common/utils/optional-input.util';
import { parseReservationIdInput } from '../../common/utils/reservation-id.util';

export class GuestVerifyDto {
  @IsOptional()
  @Transform(({ value }) => parseReservationIdInput(value))
  @IsInt()
  reservationId?: number;

  @IsOptional()
  @Transform(({ value }) => normalizeOptionalInput(value))
  @IsString()
  phone?: string;

  @IsOptional()
  @Transform(({ value }) => normalizeOptionalInput(value))
  @IsEmail()
  email?: string;

  @Transform(({ value }) => normalizeDateInput(value))
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  arrivalDate!: string;

  @Transform(({ value }) => normalizeDateInput(value))
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  departureDate!: string;

  @IsOptional()
  @Transform(({ value }) => normalizeOptionalInput(value))
  @IsString()
  listingName?: string;

  @IsOptional()
  @Transform(({ value }) => normalizeOptionalInput(value))
  @IsString()
  callId?: string;
}
