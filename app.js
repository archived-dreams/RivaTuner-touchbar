/**
"{\"text\":\"newTitle\",
\"icon_data\": \"base64_icon_data\",
\"icon_path\":\"path_to_new_icon\",
\"background_color\": \"255,85,100,255\",
\"font_color\": \"100,200,100,255\",
\"font_size\": 10}"
*/

const axios = require('axios');
const xml_parse = require('xml2js').parseString;
const pretty = require('prettysize');
const Memcached = require('memcached');

const config = {
  api: {
    url: "http://192.168.0.104:82/mahm",
    username: "MSIAfterburner",
    password: "17cc95b4017d496f82"
  },

  colors: {
    danger: '255,107,129',
    warning: '236,204,104',
    success: '123,237,159',
    default: '255,255,255'
  },

  backgrounds: {
    default: '0,0,0'
  }
};

let memcached = new Memcached('127.0.0.1:11211');

// Получение данных из memcached
function cache (key, value, time) {
  return new Promise(resolve => {

    // Set
    if (typeof value !== 'undefined') {
      memcached.set(`RivaTuner-app-${ key }`, value, time, function () {
        resolve(true);
      });
    }

    // Get
    memcached.get(`RivaTuner-app-${ key }`, function (err, data) {
      resolve(typeof data === 'object' ? data : false);
    });

  });
}

// Обноавлем данные
async function reload () {

  // Блокируем множественные обновления
  if (await cache('lock') === true) {
    return new Promise(function (resolve, reject) {
        setTimeout(function () {
          resolve(run());
        }, 100);
    });
  } else {
    cache('lock', true, 1);
  }

  // XML данные статистики
  const xml = (await axios.request({
    url: config.api.url,
    method: 'get',
    auth: {
      username: config.api.username,
      password: config.api.password,
    },
    responseType: 'text',
    timeout: 700
  })).data;

  // Получаем все сенсоры
  let sensors = {};
  let data = await (() => {
    return new Promise(resolve => {
      xml_parse(xml, (err, result) => {
        resolve(result.HardwareMonitor.HardwareMonitorEntries[0].HardwareMonitorEntry);
      });
    });
  })();

  // Обработка данных
  data.forEach(sensor => {
    switch (sensor.srcName[0]) {

      // Использование оперативной памяти
      case 'RAM usage':
        sensors.ram = {
          value: pretty(parseFloat(sensor.data[0]).toFixed(0) * 1024 * 1024).padStart(8),
          limit: pretty(parseFloat(sensor.maxLimit[0]).toFixed(0) * 1024 * 1024).padStart(8),
          color: (() => {
            let precent = 100 / sensor.maxLimit[0] * sensor.data[0];

            if (precent > 85) {
              return config.colors.danger;
            } else if (precent > 70) {
              return config.colors.warning;
            } else {
              return config.colors.default;
            }
          })()
        };
        break;

      // Температура GPU
      case 'GPU temperature':
        sensors.gpu = {
          temperature: `${ parseFloat(sensor.data[0]).toFixed(0) } °${ sensor.srcUnits[0] }`,
          color: (() => {
            let temperature = sensor.data[0];

            if (temperature < 43) {
              return config.colors.default;
            } else if (temperature < 75) {
              return config.colors.success;
            } else if (temperature < 87) {
              return config.colors.warning;
            } else {
              return config.colors.danger;
            }
          })()
        };
        break;

      // Нагрузка на GPU
      case 'GPU usage':
        sensors.gpu.usage = `${ parseFloat(sensor.data[0]).toFixed(0) } ${ sensor.srcUnits[0] }`;
        break;

      // Частота ядра GPU
      case 'Core clock':
        sensors.gpu.clock = `${ parseFloat(sensor.data[0]).toFixed(0).padStart(4, 0) } ${ sensor.srcUnits[0] }`;
        break;

      // Температура CPU
      case 'CPU temperature':
        sensors.cpu = {
          temperature: `${ parseFloat(sensor.data[0]).toFixed(0) } °${ sensor.srcUnits[0] }`,
          color: (() => {
            let temperature = sensor.data[0];

            if (temperature < 50) {
              return config.colors.default;
            } else if (temperature < 65) {
              return config.colors.success;
            } else if (temperature < 80) {
              return config.colors.warning;
            } else {
              return config.colors.danger;
            }
          })()
        };
        break;

      // Нагрузка на CPU
      case 'CPU usage':
        sensors.cpu.usage = `${ parseFloat(sensor.data[0]).toFixed(0) }${ sensor.srcUnits[0] }`;
        break;

      // Частота ядра CPU
      case 'CPU clock':
        sensors.cpu.clock = `${ parseFloat(sensor.data[0]).toFixed(0).padStart(4, 0) } ${ sensor.srcUnits[0] }`;
        break;

    };

  });

  // Сохраняем в кэш
  cache('lock', false, 1);
  cache('sensors', sensors, 3);

  // Продолжаем выполнение
  run();
};

// Возвращаем результат результат
function result (data) {

  // Меняем формат цвета
  data.font_color = `${ data.font_color === undefined ? config.colors.default : data.font_color },255`;
  data.background_color = `${ data.background_color === undefined ? config.backgrounds.default : data.background_color },255`;

  console.log(JSON.stringify(data));
};

// Выполняем поставленную задачу
async function run () {

  // Получаем сенсоры
  let sensors = await cache('sensors');

  // Если нужно перезагрузить данные
  if (sensors === false) {
      return reload();
  }

  // Отдаем данные
  switch (process.argv[2]) {

    // Оперативная память
    case 'ram':
      result({
        text: `${ sensors.ram.value }\r\n${ sensors.ram.limit }`,
        font_color: sensors.ram.color,
        font_size: 12
      });
      break;

    // Температура GPU
    case 'gpu_temperature':
      result({
        text: `${ sensors.gpu.temperature }`,
        font_color: sensors.gpu.color,
        font_size: 15
      });
      break;

    // Нагрузка на GPU
    case 'gpu_load':
      result({
        text: `${ sensors.gpu.usage }\r\n${ sensors.gpu.clock }`,
        font_size: 12
      });
      break;

    // Температура CPU
    case 'cpu_temperature':
      result({
        text: `${ sensors.cpu.temperature }`,
        font_color: sensors.cpu.color,
        font_size: 15
      });
      break;

    // Нагрузка на CPU
    case 'cpu_load':
      result({
        text: `${ sensors.cpu.usage }\r\n${ sensors.cpu.clock }`,
        font_size: 12
      });
      break;

  };
  process.exit(0);
}

run();


// // При запросе памяти - выполняем обновление данных
// if (process.argv[2] === 'ram') {
//   reload();
// }
//
// run();
