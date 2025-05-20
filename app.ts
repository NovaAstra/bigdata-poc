import { Cluster } from "./cluster";

async function bootstrap() {
  const cluster = await Cluster.launch();
  console.log(1212)

 const a =  await cluster.queue(30, { scriptURL: () => `self.onmessage=e=>postMessage(e.data)` })
 console.log(a)
}

bootstrap()