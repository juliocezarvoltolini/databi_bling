import { OriginalBase } from "src/common/original-entity";
import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn } from "typeorm";
import { PlanoContaTipo } from "./plano-conta.types";

@Entity({name: 'plano_conta'})
export class PlanoConta extends OriginalBase {
    @PrimaryGeneratedColumn({type: 'integer'})
    id: number;
    @Column({name: 'descricao', type: 'character varying', length: 150})
    descricao: string;
    @Column({name: 'tipo', enum: PlanoContaTipo, default: PlanoContaTipo.RECEITA_E_DESPESA})
    tipo: PlanoContaTipo;
    @ManyToOne(() => PlanoConta)
    @JoinColumn({name: 'id_plano_conta_pai', referencedColumnName: 'id'})
    planoContaPai: PlanoConta;
    
}