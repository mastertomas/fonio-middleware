import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateSyncSettingsDto {
  @IsOptional()
  @IsBoolean()
  autoSyncEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(1440)
  intervalMinutes?: number;
}
