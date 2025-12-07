import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'user@example.com', description: 'メールアドレス' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password123', description: 'パスワード' })
  @IsString()
  @MinLength(8)
  password: string;
}

export class RegisterDto {
  @ApiProperty({ example: '株式会社サンプル', description: '会社名' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  companyName: string;

  @ApiProperty({ example: '山田太郎', description: '担当者名' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name: string;

  @ApiProperty({ example: 'user@example.com', description: 'メールアドレス' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password123', description: 'パスワード（8文字以上）' })
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    tenantId: string;
    tenantName: string;
  };
}

