// Fail at startup with a clear message instead of a confusing upstream error on first request.
export default defineNitroPlugin(() => {
  try {
    assertMemtimeConfig()
  }
  catch (err) {
    console.error(`\n[config] ${(err as Error).message}\n`)
    throw err
  }
})
