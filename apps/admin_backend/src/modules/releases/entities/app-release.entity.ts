import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  Unique,
} from 'typeorm';

@Entity('app_releases')
@Unique('uq_app_releases_channel_abi_version_code', [
  'channel',
  'abi',
  'version_code',
])
@Index('idx_app_releases_lookup', ['channel', 'abi', 'version_code'])
export class AppRelease {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 32 })
  channel: string;

  @Column({ type: 'varchar', length: 32 })
  abi: string;

  @Column({ type: 'integer' })
  version_code: number;

  @Column({ type: 'varchar', length: 32 })
  version_name: string;

  @Column({ type: 'varchar', length: 64 })
  sha256: string;

  @Column({ type: 'bigint' })
  size_bytes: string;

  @Column({ type: 'varchar', length: 255 })
  storage_key: string;

  @Column({ type: 'integer' })
  min_from_version_code: number;

  @Column({ type: 'boolean', default: false })
  mandatory: boolean;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  published_at: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
