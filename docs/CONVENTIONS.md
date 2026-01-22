# Conventions

## Pagination
List endpoints return:
{
  items: T[],
  total: number,
  page: number,
  pageSize: number
}

## Errors
- 400: validation
- 401: unauthorized
- 403: forbidden (ownership)
- 404: not found
- 409: conflict

## Ownership
All routes containing accountId must validate account ownership on server.
