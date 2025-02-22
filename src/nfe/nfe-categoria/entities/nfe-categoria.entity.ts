import { OriginalBase } from "src/common/original-entity";
import { Column, Entity, PrimaryColumn, PrimaryGeneratedColumn } from "typeorm";

@Entity({name: 'nfe_categoria'})
export class NfeCategoria extends OriginalBase {
    @PrimaryGeneratedColumn({type: 'int4'})
    id: number;
    @Column({name: 'descricao', type: 'text'})
    descricao: string;    
}