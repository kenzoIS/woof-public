import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
export class SessionActivityDto {
  @IsInt()
  @Min(1)
  @Max(120)
  timeoutMinutes: number;
}
export class LogoutDto {
  @IsOptional()
  @IsIn(['logout', 'session_timeout'])
  reason?: 'logout' | 'session_timeout';
}
