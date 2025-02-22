import { Fornecedor } from 'src/fornecedor/entities/fornecedor.entity';
import { Column, Entity, JoinColumn, ManyToMany, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';

import { FormaPagamento } from 'src/forma-pagamento/entities/forma-pagamento.entity';
import { Portador } from 'src/conta/portador/entities/portador.entity';
import { PlanoConta } from 'src/conta/plano-conta/entities/plano-conta.entity';
import { Pessoa } from 'src/pessoa/entities/pesssoa.entity';
import { OriginalBase } from 'src/common/original-entity';
import { ContaReceberSituacao } from './conta-receber.types';
import { Recebimento } from '../recebimento/entities/recebimento.entity';

// import { Pagamento } from '../../negociacao-pagamento/pagamento/entities/pagamento.entity';


@Entity('conta_receber')
export class ContaReceber extends OriginalBase {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id: number;
  @ManyToOne((type) => Pessoa, (pessoa) => pessoa.id, { eager: true })
  @JoinColumn({ name: 'id_pessoa', referencedColumnName: 'id' })
  pessoa: Pessoa;
  @Column({ name: 'data_emissao', type: 'date', nullable: true })
  dataEmissao: Date;
  @Column({ name: 'data_vencimento', type: 'date', nullable: false })
  dataVencimento: Date;
  @Column({ name: 'data_competencia', type: 'date', nullable: true })
  dataCompetencia: Date;
  @Column({ name: 'numero_documento', type: 'character varying', length: 50, nullable: true })
  numeroDocumento: string;
  @Column({ name: 'historico', type: 'text', nullable: true })
  historico: string;
  @Column({ name: 'situacao', enum: ContaReceberSituacao, default: ContaReceberSituacao.EM_ABERTO })
  situacao: ContaReceberSituacao;
  @ManyToOne((type) => FormaPagamento, (forma) => forma.id, { eager: true })
  @JoinColumn({ name: 'id_forma_pagamento', referencedColumnName: 'id' })
  formaPagamento: FormaPagamento;
  @Column({ name: 'valor', type: 'numeric', precision: 14, scale: 2 })
  valor: number;
  @ManyToOne((type) => Portador, (portador) => portador.id, { eager: true })
  @JoinColumn({ name: 'id_portador', referencedColumnName: 'id' })
  portador: Portador;
  @ManyToOne((type) => PlanoConta, (planoConta) => planoConta.id, { eager: true })
  @JoinColumn({ name: 'id_plano_conta', referencedColumnName: 'id' })
  planoConta: PlanoConta;
  @OneToMany(() => Recebimento, (recebimento) => recebimento.contaReceber, { cascade: true, eager: true })
  recebimentos: Recebimento[];
}
