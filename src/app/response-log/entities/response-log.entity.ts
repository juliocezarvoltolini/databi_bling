import { Column, Entity, PrimaryGeneratedColumn, Unique } from "typeorm";

@Entity({name: 'response_log'})
@Unique('response_log_nome_informacao_e_id_original_unique', ['nomeInformacao', 'idOriginal'])
export class ResponseLog {
    @PrimaryGeneratedColumn({type: 'int8'})
    id: number;
    @Column({name: 'nome_informacao', type: 'varchar', length: 100})
    nomeInformacao: string;
    @Column({name: 'response', type: 'text'})
    response: string;
    @Column({name: 'id_original', type: 'varchar', length: 50})
    idOriginal: string;
    @Column({name: 'data', type: 'timestamp', nullable: true})
    data: Date;

}