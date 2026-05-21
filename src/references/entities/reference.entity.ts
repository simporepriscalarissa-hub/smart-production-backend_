import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity()
export class Reference {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  code: string;

  @Column()
  libelle: string;

  @Column({ type: 'float', default: 60 })
  tempsCycle: number; // secondes par pièce

  @CreateDateColumn()
  createdAt: Date;
}
