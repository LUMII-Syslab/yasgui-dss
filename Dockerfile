FROM node:latest


WORKDIR /app

RUN git clone https://github.com/LUMII-Syslab/yasgui-dss .

RUN npm install

EXPOSE 3006
CMD ["npm", "start"]
