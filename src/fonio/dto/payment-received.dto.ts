import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { normalizeOptionalInput } from '../../common/utils/optional-input.util';

function parseRequiredInt(value: unknown): number {
  if (value === '' || value === null || value === undefined) {
    return Number.NaN;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : Number.NaN;
}

export class PaymentReceivedDto {
  @Transform(({ value }) => parseRequiredInt(value))
  @IsInt()
  reservationId!: number;

  @IsString()
  @IsNotEmpty()
  verificationToken!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @Transform(({ value }) => normalizeOptionalInput(value))
  @IsString()
  callId?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
