import { ViewColumn, ViewEntity } from "typeorm"

@ViewEntity({
    name: 'produto_categoria_relacao_view',
    expression: `
        select 
            pcr.id_produto, 
            pc.id as id_categoria, 
            pc.nome as categoria, 
            pco.id as id_opcao, 
            pco.nome as opcao, 
            pc.tipo 
        from 
            produto_categoria_relacao as pcr
	        inner join produto_categoria_opcao as pco ON pcr.id_produto_categoria_opcao = pco.id
	        inner join produto_categoria as pc ON pco.id_produto_categoria = pc.id 
    `,
})
export class ProdutoCategoriaRelacaoView {
    @ViewColumn()
    id_produto: number;
    @ViewColumn()
    id_categoria: number;
    @ViewColumn()
    categoria: string;
    @ViewColumn()
    id_opcao: number;
    @ViewColumn()
    opcao: string;
    @ViewColumn()
    tipo: string;

}