import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateLogSettingsDto {
  @IsOptional()
  @IsInt()
  @Min(7)
  @Max(14)
  debugRetentionDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  operationalRetentionDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  piiRetentionDays?: number;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(90)
  maxRetentionDays?: number;
}
