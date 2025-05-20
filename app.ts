import { Cluster } from "./cluster";

async function bootstrap() {
  const cluster = await Cluster.launch();

  const a1 = await cluster.queue(30, {
    scriptURL: (data) => {
      return data
    }
  })
  const a2 = await cluster.queue(30, {
    scriptURL: (data) => {
      return data
    }
  })
  const a3 = await cluster.queue(30, {
    scriptURL: (data) => {
      return data
    }
  })
  const a4 = await cluster.queue(30, {
    scriptURL: (data) => {
      return data
    }
  })
  console.log(a1,a2,a3,a4)
}

bootstrap()