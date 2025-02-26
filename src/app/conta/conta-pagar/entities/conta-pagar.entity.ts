import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { ContaPagarSituacao } from './conta-pagar.types';
import { FormaPagamento } from 'src/app/forma-pagamento/entities/forma-pagamento.entity';
import { Portador } from 'src/app/conta/portador/entities/portador.entity';
import { PlanoConta } from 'src/app/conta/plano-conta/entities/plano-conta.entity';
import { Pessoa } from 'src/app/pessoa/entities/pesssoa.entity';
import { Pagamento } from '../pagamento/entities/pagamento.entity';
import { OriginalBase } from 'src/shared/original-entity';
// import { Pagamento } from '../../negociacao-pagamento/pagamento/entities/pagamento.entity';

@Entity('conta_pagar')
export class ContaPagar extends OriginalBase {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id: number;
  @ManyToOne(() => Pessoa, (pessoa) => pessoa.id, { eager: true })
  @JoinColumn({ name: 'id_pessoa', referencedColumnName: 'id' })
  pessoa: Pessoa;
  @Column({ name: 'data_emissao', type: 'date', nullable: false })
  dataEmissao: Date;
  @Column({ name: 'data_vencimento', type: 'date', nullable: false })
  dataVencimento: Date;
  @Column({ name: 'data_competencia', type: 'date', nullable: true })
  dataCompetencia: Date;
  @Column({ name: 'numero_documento', type: 'character varying', length: 50, nullable: true })
  numeroDocumento: string;
  @Column({ name: 'historico', type: 'text', nullable: true })
  historico: string;
  @Column({ name: 'situacao', enum: ContaPagarSituacao, default: ContaPagarSituacao.EM_ABERTO })
  situacao: ContaPagarSituacao;
  @ManyToOne(() => FormaPagamento, (forma) => forma.id, { eager: true })
  @JoinColumn({ name: 'id_forma_pagamento', referencedColumnName: 'id' })
  formaPagamento: FormaPagamento;
  @Column({ name: 'valor', type: 'numeric', precision: 14, scale: 2 })
  valor: number;
  @ManyToOne(() => Portador, (portador) => portador.id, { eager: true })
  @JoinColumn({ name: 'id_portador', referencedColumnName: 'id' })
  portador: Portador;
  @ManyToOne(() => PlanoConta, (planoConta) => planoConta.id, { eager: true })
  @JoinColumn({ name: 'id_plano_conta', referencedColumnName: 'id' })
  planoConta: PlanoConta;
  @OneToMany(() => Pagamento, (pagamento) => pagamento.contaPagar, { cascade: true, eager: true })
  pagamentos: Pagamento[];
}
