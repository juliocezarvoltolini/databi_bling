import { defer, forkJoin, from, mergeMap, Observable, of, switchMap, throwError } from 'rxjs';
import { DeepPartial, Equal, Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { IService } from './service.interface';
import { BuildFindOptionsFromModel } from './service.util';
import { ResponsePage } from '../page/response-page-interface';
import { validate } from 'class-validator';
import { IPageRequest, PageRequest } from '../page/request-page-interface';

export class BaseService<A extends object> implements IService<A> {
  constructor(public repository: Repository<A>) {}

  find(entity: DeepPartial<A>): Observable<A[]> {
    const where = BuildFindOptionsFromModel<A>(entity, this.repository.metadata);
    return from(
      this.repository.find({
        where: where,
      }),
    );
  }

  create(entityDTO: DeepPartial<A>): Observable<A>;
  create(entitiesDTO: DeepPartial<A[]>): Observable<A[]>;
  create(entityDTO: DeepPartial<A> | DeepPartial<A[]>): Observable<A> | Observable<A[]> {
    const newEntity = Array.isArray(entityDTO)
      ? this.repository.create(entityDTO as A[]) // Cria múltiplos
      : this.repository.create(entityDTO); // Cria único

    const validateEntity$ = from(validate(newEntity));

    if (Array.isArray(newEntity)) {
      return validateEntity$.pipe(
        mergeMap((errors) => {
          if (errors.length > 0) {
            return throwError(
              () =>
                new Error(
                  'Validation failed: ' + JSON.stringify(errors.map((value) => value.constraints)),
                ),
            );
          }
          return defer(() => from(this.repository.save(newEntity))); // Observable<A[]>
        }),
      ) as Observable<A[]>; // Garantimos explicitamente o tipo
    }

    return validateEntity$.pipe(
      mergeMap((errors) => {
        if (errors.length > 0) {
          return throwError(
            () =>
              new Error(
                'Validation failed: ' + JSON.stringify(errors.map((value) => value.constraints)),
              ),
          );
        }
        return defer(() => from(this.repository.save(newEntity))); // Observable<A>
      }),
    ) as Observable<A>; // Garantimos explicitamente o tipo
  }

  pagedSearch(pageRquest: IPageRequest<A>): Observable<ResponsePage<A>> {
    const pageService = new PageRequest(pageRquest);

    const where$ = BuildFindOptionsFromModel<A>(pageRquest.object, this.repository.metadata);

    return forkJoin([
      from(
        this.repository.find({
          where: where$,
          take: pageService.getQuantidadePorPagina(),
          skip: pageService.getSkip(0),
          order: pageService.getOrdenarPor(),
        }),
      ),
      from(this.repository.count({ where: where$ })),
    ]).pipe(
      switchMap(([lista, quantidade]) => {
        const retorno: ResponsePage<A> = new ResponsePage<A>();
        retorno.pagina = pageService.getPagina();
        retorno.quantidadeNaPagina = lista.length;
        retorno.quantidadePorPagina = pageService.getQuantidadePorPagina();
        retorno.quantidadeTotal = quantidade;
        retorno.ultimaPagina = pageService.getUltimaPagina(quantidade);
        retorno.registros = lista;
        return of(retorno);
      }),
    );
  }
  findOne(id: any): Observable<A> {
    const idPropertyName = this.repository.metadata.primaryColumns[0].propertyName;
    const _where = {};
    _where[idPropertyName] = Equal(id);
    console.log(_where);
    return defer(() => this.repository.findOne({ where: _where }));
  }

  update(id: any, entityDTO: QueryDeepPartialEntity<A>): Observable<A> {
    return defer(() => this.repository.update(id, entityDTO)).pipe(
      switchMap(() => {
        return this.findOne(id);
      }),
    );
  }
}
