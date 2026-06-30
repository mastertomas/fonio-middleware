import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApprovalMode, RequestType } from '@prisma/client';

export class CreateApprovalRuleDto {
  @IsOptional()
  @IsString()
  listingId?: string;

  @IsEnum(RequestType)
  requestType!: RequestType;

  @IsEnum(ApprovalMode)
  mode!: ApprovalMode;

  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateApprovalRuleDto {
  @IsOptional()
  @IsString()
  listingId?: string | null;

  @IsOptional()
  @IsEnum(RequestType)
  requestType?: RequestType;

  @IsOptional()
  @IsEnum(ApprovalMode)
  mode?: ApprovalMode;

  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateVerificationConfigDto {
  @IsOptional()
  requiredFields?: string[];

  @IsOptional()
  @IsInt()
  minMatchCount?: number;
}
