import { IsEmail, IsInt, IsOptional, IsString } from 'class-validator';

export class GuestVerifyDto {
  @IsInt()
  reservationId!: number;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  arrivalDate?: string;

  @IsOptional()
  @IsString()
  departureDate?: string;

  @IsOptional()
  @IsString()
  listingName?: string;

  @IsOptional()
  @IsString()
  callId?: string;
}
