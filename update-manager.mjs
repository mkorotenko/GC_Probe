import { execa } from 'execa';

// Вкажіть шлях до вашого проекту
const projectPath = '/home/pi/DEV/GC_Probe';

// Функція для виконання команд
async function runCommand(command, args) {
  try {
    const { stdout } = await execa(command, args, { cwd: projectPath });
    console.log(`Stdout: ${stdout}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
  }
}

// Отримання останніх змін з віддаленого репозиторію
export default async function updateManager() {
  await runCommand('git', ['pull', 'origin', 'main']);
  console.log('Files updated from GitHub');

  await runCommand('npm', ['install']);
  console.log('Updated npm packages');
  
  // Перезапуск 
  await runCommand('sudo', ['systemctl', 'daemon-reload']);
  console.log('Service restarted');

  // Перезапуск сервісу
  console.log('Service restarting...');
  runCommand('sudo', ['systemctl', 'restart', 'peer-cl.service']);
};
