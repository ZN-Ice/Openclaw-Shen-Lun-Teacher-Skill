1. 使用`npm run build`打包bundle到`scripts\shenlun.js`
2. 使用`node scripts/shenlun.js help`，验证方法如下：
    - 查看其中的内容与README.md和SKILL.md是否一致，如果不一致，查看代码分析需要修改哪边
2. 使用`node scripts/shenlun.js scrape 湖南 2024`继续测试，验证方法如下：
    - 查看`data`路径下是否有对应文件夹
    - 文件夹下有没有origin.txt文件
    - 以及读取读取这个文件查看是否正确存在材料和问题