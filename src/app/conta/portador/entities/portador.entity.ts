import { OriginalBase } from 'src/shared/original-entity';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'portador' })
export class Portador extends OriginalBase {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id: number;
  @Column({ name: 'descricao', type: 'character varying', length: 150 })
  descricao: string;
}
