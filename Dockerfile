# Build the browser assets first, then publish the .NET host.
FROM node:22-alpine AS frontend
WORKDIR /src
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run tw

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY . .
COPY --from=frontend /src/VeyraScreen/wwwroot/css/app.css ./VeyraScreen/wwwroot/css/app.css
RUN dotnet restore VeyraScreen/VeyraScreen.csproj
RUN dotnet publish VeyraScreen/VeyraScreen.csproj -c Release --no-restore -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
ENV ASPNETCORE_ENVIRONMENT=Production
COPY --from=build /app/publish .
EXPOSE 10000
ENTRYPOINT ["sh", "-c", "dotnet VeyraScreen.dll --urls http://0.0.0.0:${PORT:-10000}"]
