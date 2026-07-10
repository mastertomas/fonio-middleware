import { ArrayMaxSize, IsArray, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateListingAliasesDto {
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MinLength(2, { each: true })
  @MaxLength(120, { each: true })
  aliases!: string[];
}
