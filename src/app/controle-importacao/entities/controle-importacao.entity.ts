import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'controle_importacao' })
export class ControleImportacao {
  @PrimaryGeneratedColumn({ type: 'int4' })
  id: number;
  @Column({ name: 'tabela', type: 'varchar', length: 100, unique: true })
  tabela: string;
  @Column({ name: 'pagina', type: 'int4' })
  pagina: number;
  @Column({ name: 'ultimo_index_processado', type: 'int2', nullable: true })
  ultimoIndexProcessado: number;
  @Column({ name: 'data', type: 'date', nullable: true, update: true })
  data: Date;
  @Column({ name: 'parametros', type: 'jsonb', nullable: true })
  parametros: Record<string, any>;
  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamp with time zone', nullable: true }) // PostgreSQL
  atualizadoEm: Date;
  @Column({ name: 'iniciou_consulta_em', type: 'timestamp with time zone', nullable: true })
  iniciouConsultaEm: Date;
  @Column({ name: 'terminou_consulta_em', type: 'timestamp with time zone', nullable: true })
  terminouConsultaEm: Date;
  @Column({ name: 'com_erro', default: false })
  comErro: boolean;
  @Column({ name: 'ultimo_erro', type: 'text', nullable: true })
  ultimoErro: string;
}
