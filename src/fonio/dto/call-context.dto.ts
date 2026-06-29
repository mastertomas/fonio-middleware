import { IsOptional, IsString } from 'class-validator';

export class FonioCallContextDto {
  @IsOptional()
  @IsString()
  callerNumber?: string;

  @IsOptional()
  @IsString()
  callId?: string;

  @IsOptional()
  @IsString()
  agentId?: string;
}
