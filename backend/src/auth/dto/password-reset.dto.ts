import { IsEmail, IsString, MinLength } from 'class-validator';

export class PasswordResetRequestDto {
  @IsEmail()
  email: string;
}

export class VerifyResetOtpDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  otp: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(12)
  password: string;
}
