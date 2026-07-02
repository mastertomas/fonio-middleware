import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { normalizeDateInput } from '../../common/utils/date-input.util';

export class BookingOfferDto {
  @Type(() => Number)
  @IsInt()
  listingId!: number;

  @Transform(({ value }) => normalizeDateInput(value))
  @IsString()
  checkIn!: string;

  @Transform(({ value }) => normalizeDateInput(value))
  @IsString()
  checkOut!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  guests!: number;

  @IsString()
  guestFirstName!: string;

  @IsString()
  guestLastName!: string;

  @IsEmail()
  guestEmail!: string;

  @IsString()
  phone!: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  pets?: number;
}
