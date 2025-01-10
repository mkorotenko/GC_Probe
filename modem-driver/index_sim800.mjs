import { Sim800Client } from 'sim800';

const config = {
  port: '/dev/serial0',
  baudRate: 115200,
  pin: '1234',
};

console.info('Crating object...');
const client = new Sim800Client(config);

console.info('On network ready...');
client.on('networkReady', async () => {
    console.info('Check device...');
  const isModemOk = await client.send(new AtCommand());
    console.info('Device resp:', isModemOk);
});
