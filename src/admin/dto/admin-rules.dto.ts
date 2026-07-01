import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApprovalMode, RequestType } from '@prisma/client';
import { VERIFICATION_FIELD_OPTIONS } from '../../fonio/verification-fields';

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
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @IsIn([...VERIFICATION_FIELD_OPTIONS], { each: true })
  requiredFields?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(6)
  minMatchCount?: number;
}
