import Layout from '@/components/layout/Layout';

const Dashboard = () => {
  return (
    <Layout>
      <div className="flex flex-col items-center justify-center p-4">
        <h1 className="text-3xl font-bold mb-4">Bienvenido al Panel de Administración</h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          Aquí podrás gestionar tu aplicación.
        </p>
      </div>
    </Layout>
  );
};

export default Dashboard;