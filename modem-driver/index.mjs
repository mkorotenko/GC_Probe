import { CommunicationModule } from './sim-driver.mjs';
import { UART_PATH, BAUDRATE } from './modem-config.mjs';

const echo = async () => {
  const modem = new CommunicationModule(UART_PATH, BAUDRATE);
  await modem.pwrOn();
  // await modem.openConnection();
  // await modem.getGSMLocation();
  // await modem.pwrToggle();
  // await modem.getGNSSLocation();
}

await echo();