import { Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class GuestVerifyDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  reservationId?: number;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  arrivalDate!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  departureDate!: string;

  @IsOptional()
  @IsString()
  listingName?: string;

  @IsOptional()
  @IsString()
  callId?: string;
}
