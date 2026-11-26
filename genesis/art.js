(() => {
  'use strict';
  const palettes = {
    rabbit: ['#26362c','#6d927b','#aec6a7','#f1ead0','#d89ca0','#fff4d4'],
    fox: ['#402a22','#924529','#d87736','#f8a84f','#f1ddaf','#fff0c9'],
    deer: ['#382d23','#8b5c3e','#bb8c5a','#edc991','#ead49e','#fcf0c7'],
    boar: ['#352f3c','#675275','#96849e','#cbb3c2','#b87992','#eed9cb'],
    wolf: ['#252f36','#506072','#7c93a1','#a9c1cc','#e1d6bf','#eaf5ec'],
    leaf: ['#28442c','#446136','#74a347','#acd767','#d4ef8c','#edf7bb'],
    sprout: ['#253d28','#507f40','#78b358','#a4d56b','#d1ed98','#e4f7aa']
  };
  const tiles = {
    rabbit: [
      '     11  11     ','    13411441    ','    13411441    ','     134141     ',
      '     1333331    ',' 11 133334311   ','14413344314141  ','144344444441441 ',
      ' 13344444334441 ',' 1233333333341  ',' 122333333331   ','  12223112331   ',
      '   1331  13331  ','   1111  11111  '
    ],
    fox: [
      '       11   11  ','       131 131  ','  1    1431341  ',' 141   1343341  ',
      '15431  13333331 ','154331133331341 ',' 154333333334111','  1433333333441 ',
      '   13333333351  ','    122333251   ','     12211221   ','     121  131   ',
      '     111  1111  '
    ],
    deer: [
      '        1  1 1  ','        11 111  ','         1111   ','      11  131   ',
      '      12313331  ','       13331341 ','  1   133333341 ',' 1211133333311  ',
      '  13343433331   ','  1333433331    ','  122332331     ','   121 121      ',
      '   121  121     ','   111  111     '
    ],
    boar: [
      '      11  1     ','     1331131    ',' 1 1133333331   ','13133343343311  ',
      ' 13334334333131 ',' 13333333333551 ',' 12323333333551 ',' 1223222223361  ',
      '  12222222221   ','   1211  121    ','   111   111    '
    ],
    wolf: [
      '        11  11  ','        131131  ',' 11     143341  ',' 141   13333331 ',
      ' 13411133331341 ','  13433333334511','   133333333551 ','   12333333351  ',
      '    122222221   ','    121  121    ','    121   121   ','    111   111   '
    ],
    leaf: [
      '       11','     1341','   134441','  1343431',' 1343431 ',' 133331  ',' 12221   ',' 121     ','11       '
    ],
    sprout: [
      '         111111 ','        1334441 ','       1344441  ','  1111 133331   ',
      '  1344113321    ','   13443221     ','    1223321     ','       131      ',
      '       131      ','       111      '
    ]
  };
  const names = {
    herbivore:'rabbit',herb:'rabbit',grazer:'rabbit',bunny:'rabbit',hare:'rabbit',
    carnivore:'fox',predator:'fox',pred:'fox',hunter:'fox',
    omnivore:'boar',omni:'boar',pig:'boar', forage:'leaf',food:'leaf',plant:'sprout',seed:'sprout'
  };
  const cache = new Map();
  function species(which) {
    if (typeof which === 'object' && which) which = which.kind ?? which.type ?? which.species;
    if (typeof which === 'number') return ['rabbit','fox','boar'][which] || 'rabbit';
    const key = String(which || 'rabbit').toLowerCase();
    return tiles[key] ? key : names[key] || 'rabbit';
  }
  function getSprite(which, frame = 0) {
    const key = species(which), tick = Number(frame) % 2 ? 1 : 0, id = key + tick;
    if (cache.has(id)) return cache.get(id);
    const sheet = document.createElement('canvas'), data = tiles[key], colors = palettes[key];
    sheet.width = 16; sheet.height = 16;
    const ctx = sheet.getContext('2d');
    const left = Math.floor((16 - Math.max(...data.map(row=>row.length))) / 2);
    const top = Math.floor((16 - data.length) / 2);
    data.forEach((row,y) => [...row].forEach((pixel,x) => {
      if (pixel===' ') return;
      const walking = tick && y >= data.length - 2 && !['leaf','sprout'].includes(key);
      ctx.fillStyle = colors[Number(pixel)-1] || colors[0];
      ctx.fillRect(x+left+(walking ? x<8 ? 1 : -1 : 0),top+y,1,1);
    }));
    cache.set(id,sheet);
    return sheet;
  }
  Object.assign(palettes, {
    bird:['#2b3549','#465d8a','#718dc2','#acc7ed','#ffc363','#f9e5d9'],
    berries:['#37342b','#587540','#8fb150','#ab3946','#e96b64','#ffc997'],
    paw:['#243e2c','#528264','#81b586','#a9dba1','#d5efbd','#eff7d8'],
    layers:['#463e2c','#826943','#bf985c','#e4be77','#f5dd9a','#ffedc7'],
    dna:['#42374d','#66527d','#a786c8','#c5a3dd','#dfcaed','#f1e8f4']
  });
  Object.assign(tiles, {
    bird:[
      '       11 1     ','      13331     ','     1334341    ','    13444311    ',
      '   1333444151   ','1133322444551   ','13434333341     ',' 1333333441     ',
      '  12334441      ','   122221       ','    15151       ','   111111       '
    ],
    berries:[
      '     1111   ','   1123311  ','  13333221  ','   1222131  ','   14411441 ',
      '  145545541 ','  144414541 ','   1111441  ','       11   '
    ],
    paw:[
      '    11   11    ','   1341 1341   ','   1441 1441   ','    11   11    ',
      ' 11   111   11 ','1341 13331 1341','144113444311441',' 1113444443111 ',
      '   134444431   ','   134434431   ','    111 111    '
    ],
    layers:[
      '       11       ','     113411     ','   1134444311   ',' 11344444443311 ',
      ' 13344444444331 ','  113333333311  ',' 13111333311131 ',' 13431111113431 ',
      '  113333333311  ',' 13111333311131 ',' 13431111113431 ','  113444443311  ',
      '    11333311    ','      1111      '
    ],
    dna:[
      '   11     11   ','   131   141   ','   133111441   ','    1334431    ',
      '     13331     ','      131      ','     14331     ','    1441331    ',
      '   144111331   ','   141   131   ','   144111331   ','    1443331    ',
      '     14431     ','      141      ','     141       '
    ]
  });
  function sprite(name, colors={}) {
    return getSprite(name, colors && colors.frame || 0);
  }
  const urls = new Map();
  function icon(name,size=32,colors={}) {
    const key=species(name), img=new Image();
    if (!urls.has(key)) urls.set(key,sprite(name,colors).toDataURL('image/png'));
    img.src=urls.get(key);
    img.width=size;
    img.height=size;
    img.alt='';
    img.className='pixel-icon';
    return img;
  }
  window.Pixel={sprite,icon};
})();
