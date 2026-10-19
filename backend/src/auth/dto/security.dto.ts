import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MinLength,
} from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @MinLength(12)
  newPassword: string;

  @IsString()
  @MinLength(1)
  currentPassword: string;
}

export class TwoFactorCodeDto {
  @IsString()
  @MinLength(1)
  factorId: string;

  @IsString()
  @MinLength(6)
  code: string;
}

export class VerifyMfaEnrollmentDto {
  @IsUUID()
  factorId: string;

  @Matches(/^\d{6}$/)
  code: string;
}

export class LoginActivityDto {
  @IsIn(['logout', 'session_timeout'])
  action: 'logout' | 'session_timeout';

  @IsOptional()
  @IsEmail()
  email?: string;
}
