// Unknown /api/* paths answer in the BFF error shape instead of falling through to the Nuxt 404 page.
export default defineApiHandler(async (event) => {
  throw new ApiException(404, 'NOT_FOUND', `No API route for ${event.method} ${event.path.split('?')[0]}.`)
})
