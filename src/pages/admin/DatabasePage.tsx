import Layout from '@/components/layout/Layout';

const DatabasePage = () => {
  return (
    <Layout>
      <div className="flex flex-col items-center justify-center p-4">
        <h1 className="text-3xl font-bold mb-4">Base de Datos</h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          Aquí se mostrará la información de la base de datos.
        </p>
      </div>
    </Layout>
  );
};

export default DatabasePage;