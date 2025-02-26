import { Pessoa } from 'src/app/pessoa/entities/pesssoa.entity';
import { Column, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'empresa' })
export class Empresa {
  @PrimaryGeneratedColumn({ type: 'int4' })
  id: number;
  @OneToOne(() => Pessoa)
  @JoinColumn({ name: 'id_pessoa', referencedColumnName: 'id' })
  pessoa: Pessoa;
  @Column({ name: 'situacao', type: 'int2', default: 1 })
  situacao: Situacao;
}
