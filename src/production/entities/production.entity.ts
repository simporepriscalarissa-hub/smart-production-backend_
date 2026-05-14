import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import { Ouvrier } from '../../ouvriers/entities/ouvrier.entity';

@Entity()
export class Production {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Ouvrier)
  ouvrier: Ouvrier;

  @Column()
  reference: string;

  @Column({ default: 0 })
  quantiteProduite: number;

  @Column({ default: 0 })
  quantiteConforme: number;

  @Column({ default: 0 })
  quantiteNonConforme: number;

  @Column({ type: 'timestamp', nullable: true })
  dateDebut: Date;

  @Column({ type: 'timestamp', nullable: true })
  dateFin: Date;

  @CreateDateColumn()
  createdAt: Date;
}
